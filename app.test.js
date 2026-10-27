import { test } from "node:test"
import assert from "node:assert/strict"
import { createApp } from "./app.js"

async function withServer(fn) {
  const server = createApp().listen(0, "127.0.0.1")
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
