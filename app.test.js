import { test } from "node:test"
import assert from "node:assert/strict"
import { createApp } from "./app.js"

async function withServer(fn, seed) {
  const server = createApp(seed).listen(0, "127.0.0.1")
  await new Promise((ok) => server.once("listening", ok))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base)
  } finally {
    server.close()
  }
}

test("список заметок и счётчики", async () => {
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/notes`)).json()
    assert.equal(body.total, 3)
    assert.equal(body.active, 2)
  })
})

test("фильтр «сделано»", async () => {
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/notes?filter=done`)).json()
    assert.deepEqual(body.notes.map((n) => n.id), [1])
  })
})

test("добавление и отметка «сделано»", async () => {
  await withServer(async (base) => {
    const created = await fetch(`${base}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Новая заметка" }),
    })
    assert.equal(created.status, 201)
    const note = await created.json()
    const patched = await fetch(`${base}/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    })
    assert.equal((await patched.json()).done, true)
  })
})

test("пустой текст отклоняется", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "  " }),
    })
    assert.equal(res.status, 400)
  })
})

test("версия сервера", async () => {
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/version`)).json()
    assert.match(body.version, /^\d+\.\d+\.\d+$/)
  })
})

async function addNote(base, text) {
  const res = await fetch(`${base}/api/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  })
  return res.json()
}

async function markDone(base, id) {
  await fetch(`${base}/api/notes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ done: true }),
  })
}

test("сводка: сделано 1 из 3", async () => {
  await withServer(async (base) => {
    const first = await addNote(base, "Первая")
    await addNote(base, "Вторая")
    await addNote(base, "Третья")
    await markDone(base, first.id)
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.done, 1)
    assert.equal(body.total, 3)
  }, [])
})

test("сводка: дата самой новой заметки не зависит от отметки старой", async () => {
  await withServer(async (base) => {
    const first = await addNote(base, "Старая")
    await new Promise((ok) => setTimeout(ok, 5))
    const second = await addNote(base, "Новая")
    await markDone(base, first.id)
    const body = await (await fetch(`${base}/api/stats`)).json()
    assert.equal(body.lastCreatedAt, second.createdAt)
  }, [])
})

test("сводка без заметок", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { done: 0, total: 0, lastCreatedAt: null })
  }, [])
})
