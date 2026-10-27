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

test("сводка по заметкам: сделано, всего, последняя заметка", async () => {
  await withServer(async (base) => {
    const json = { "content-type": "application/json" }
    const ids = []
    for (const text of ["Первая", "Вторая", "Третья"]) {
      const res = await fetch(`${base}/api/notes`, { method: "POST", headers: json, body: JSON.stringify({ text }) })
      ids.push((await res.json()).id)
      await new Promise((ok) => setTimeout(ok, 5))
    }
    await fetch(`${base}/api/notes/${ids[0]}`, { method: "PATCH", headers: json, body: JSON.stringify({ done: true }) })

    const all = (await (await fetch(`${base}/api/notes`)).json()).notes
    const newestFirst = all.map((n) => n.createdAt).sort((a, b) => Date.parse(b) - Date.parse(a))

    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { done: 1, total: 3, lastCreatedAt: newestFirst[0] })

    await fetch(`${base}/api/notes/${ids[2]}`, { method: "DELETE" })
    const after = await (await fetch(`${base}/api/stats`)).json()
    assert.deepEqual(after, { done: 1, total: 2, lastCreatedAt: newestFirst[1] })
  }, [])
})

test("сводка без заметок", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { done: 0, total: 0, lastCreatedAt: null })
  }, [])
})

test("сводка учитывает самую новую заметку, а не последнюю в списке", async () => {
  const seed = [
    { id: 1, text: "Новая", done: true, createdAt: "2026-10-22T12:00:00.000Z" },
    { id: 2, text: "Старая", done: false, createdAt: "2026-10-20T12:00:00.000Z" },
  ]
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/stats`)).json()
    assert.deepEqual(body, { done: 1, total: 2, lastCreatedAt: "2026-10-22T12:00:00.000Z" })
  }, seed)
})
