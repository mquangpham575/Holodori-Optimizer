# Notice and third-party material

This is an unofficial, non-commercial fan project. It is not affiliated with,
sponsored by or endorsed by COVER Corp., hololive production, QualiArts, Inc.
or HolodoriDB. `hololive`, `hololive Dreams`, character names, card artwork,
song jackets and game UI belong to their respective rights holders; this
repository does not claim any rights in them.

## Third-party components and their status

| Component | Where | Status |
| --- | --- | --- |
| Team scoring / search kernel | `frontend/src/search_worker.js`, scoring helpers in `frontend/src/components/TeamBuilder.jsx` | Derived from [holodori-optimizer](https://github.com/ace-ks-dev/holodori-optimizer), which is published **"all rights reserved"** with no open-source licence. **Written permission from the author is still required before public distribution** (see `docs/permission-request.md`), or this component must be replaced with an independent implementation. |
| Card, skill and song data | fetched at runtime by `backend/src/etl/holodori-master.ts` | Derived from the [HolodoriDB](https://github.com/HolodoriDB/holodori-db-eng-diff) master-data diff, which does not state a licence (draft permission request: `docs/permission-request-holodoridb.md`). The game data itself belongs to COVER Corp. / QualiArts. The source is swappable: `HOLODORI_DATA_SOURCE` (`auto`, `master`, `optimizer`, `none`) and `HOLODORI_MASTER_BASE_URL` point the sync at a different mirror or turn it off. |
| Card artwork | `card_art` / `card_art_full` tables, `frontend/public/images/cards*` | Third-party game artwork owned by COVER Corp. / QualiArts and the artists. The framed card art comes from the optimizer bundle; the full illustrations (and the optional 5-star animation, streamed on demand) are read from `cdn.holodori.dev`, the CDN of the community site holodori.best, which serves them without authentication. We download each image once and re-check weekly, but the CDN is someone else's infrastructure: consider asking its operator for permission and credit them. A draft request is in `docs/permission-request-holodoridb.md`. Set `CARD_ART_CDN_BASE=""` (backend) and `VITE_CARD_VIDEO_BASE=""` (frontend build) to switch this off, and `CARD_ART_BUNDLE=false` to also drop the optimizer's bundled art. Rights remain with the rights holders; remove on request. |

Some source comments still reference `int3rrupt3d/holodori-optimizer`; confirm with the author whether that is the same project before contacting them.

Related policies worth reading before public deployment: the hololive production
Derivative Works Guidelines and the hololive Dreams end-user terms. Mentioning
them here does not mean they authorise every use.

## Take-down requests

Rights holders can ask for any asset, data set or feature above to be removed by
opening an issue on this repository.

This file is not legal advice.
