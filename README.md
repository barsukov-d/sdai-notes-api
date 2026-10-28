# Заметки команды — API

Сервер сервиса «Заметки команды». Хранит заметки в памяти процесса; данные сбрасываются при перезапуске.
Сайт сервиса — [sdai-notes-web](https://github.com/barsukov-d/sdai-notes-web).

## Запуск

```bash
pnpm install
pnpm start        # http://0.0.0.0:3000, порт меняется переменной PORT
pnpm test
```

## Адреса

| Метод | Адрес | Что делает |
|---|---|---|
| GET | `/api/notes?filter=all\|active\|done` | список заметок и счётчики |
| POST | `/api/notes` | добавить заметку `{ "text": "…" }` |
| PATCH | `/api/notes/:id` | отметить `{ "done": true }` |
| DELETE | `/api/notes/:id` | удалить |
| GET | `/api/version` | версия сервера |
| GET | `/api/health` | проверка, что сервер жив |

Тестовый проект для демо self-developer-ai (несколько репозиториев в одном проекте).
