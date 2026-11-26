# Elephant Find — новогодняя игра «найди слонов»

Уютная новогодняя гостиная: на картине и среди 3D-предметов спрятаны 12 слонов.

**Играть:** https://gexenemy.github.io/elephant-find/

## Устройство

- `web/` — приложение (Vite + React Three Fiber). Запуск локально: `cd web && npm install && npm run dev`.
- `export/` — то, что сайт отдаёт как статические файлы (`publicDir` в `web/vite.config.js`): сцена `hybrid.glb`, фон, картинки интерфейса и карточек, спрайты огня.
- `.github/workflows/pages.yml` — при каждом пуше в `main` GitHub собирает `web/` и публикует на Pages.

Режим по умолчанию — гибридный (картина + 3D). `?mode=full` — полностью 3D-сцена (нужен `export/finder_room.glb`, в репозиторий не входит).

## Обновить сайт

Скопировать изменённые файлы из рабочей папки `FinderGame\web` и `FinderGame\export` в те же папки репозитория и запушить в `main`.
