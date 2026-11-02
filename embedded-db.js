import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"

/**
 * Маленькая база внутри процесса, чтобы для проверки не нужен был внешний
 * сервис. Приложение не обращается к ней напрямую: оно подключается только по
 * адресу из CHECK_DB_URL. Нет адреса — приложение базы не видит, хотя она
 * работает рядом. Пароль эта база не проверяет.
 */
export async function startEmbeddedDb(port = Number(process.env.EMBEDDED_DB_PORT ?? 5544)) {
  const db = await PGlite.create()
  await db.exec(`
    CREATE TABLE marker (value text);
    INSERT INTO marker VALUES ('sdai-ext-7f3a');
  `)
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 5 })
  await server.start()
  return { port, stop: async () => { await server.stop(); await db.close() } }
}
