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

function post(base, path, body, method = "POST") {
  return fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

test("сводка: пустое хранилище", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { done: 0, total: 0, lastNoteAt: null })
  }, [])
})

test("сводка: 3 заметки, одна сделана", async () => {
  await withServer(async (base) => {
    const ids = []
    for (const text of ["Первая", "Вторая", "Третья"]) ids.push((await (await post(base, "/api/notes", { text })).json()).id)
    await post(base, `/api/notes/${ids[1]}`, { done: true }, "PATCH")
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.done, 1)
    assert.equal(body.total, 3)
  }, [])
})

test("сводка: lastNoteAt — самая поздняя заметка, даже сделанная", async () => {
  const seed = [
    { id: 1, text: "Ранняя", done: false, createdAt: "2026-10-20T09:00:00.000Z" },
    { id: 2, text: "Поздняя", done: false, createdAt: "2026-10-22T14:15:00.000Z" },
    { id: 3, text: "Средняя", done: false, createdAt: "2026-10-21T10:30:00.000Z" },
  ]
  await withServer(async (base) => {
    await post(base, "/api/notes/2", { done: true }, "PATCH")
    const body = await (await fetch(`${base}/api/stats`)).json()
    assert.deepEqual(body, { done: 1, total: 3, lastNoteAt: "2026-10-22T14:15:00.000Z" })
  }, seed)
})
