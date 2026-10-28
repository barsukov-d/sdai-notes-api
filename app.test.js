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

test("сводка по заметкам", async () => {
  await withServer(async (base) => {
    const created = []
    for (const text of ["Первая", "Вторая", "Третья"]) {
      const res = await fetch(`${base}/api/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      })
      created.push(await res.json())
      await new Promise((ok) => setTimeout(ok, 5))
    }
    await fetch(`${base}/api/notes/${created[0].id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    })
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { done: 1, total: 3, lastCreatedAt: created[2].createdAt })
  }, [])
})

test("сводка без заметок", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { done: 0, total: 0, lastCreatedAt: null })
  }, [])
})
