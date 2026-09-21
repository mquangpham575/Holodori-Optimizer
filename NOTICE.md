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
| Card, skill and song data | fetched at runtime by `backend/src/etl/holodori-master.ts` | Derived from the [HolodoriDB](https://github.com/HolodoriDB/holodori-db-eng-diff) master-data diff, which does not state a licence. The game data itself belongs to COVER Corp. / QualiArts. |
| Card artwork | `card_art` table / `frontend/public/images/cards` | Third-party game artwork read from the optimizer bundle (never from holodori.best's CDN). Rights remain with COVER Corp. / QualiArts and the artists. Remove on request of a rights holder. |

Some source comments still reference `int3rrupt3d/holodori-optimizer`; confirm with the author whether that is the same project before contacting them.

Related policies worth reading before public deployment: the hololive production
Derivative Works Guidelines and the hololive Dreams end-user terms. Mentioning
them here does not mean they authorise every use.

## Take-down requests

Rights holders can ask for any asset, data set or feature above to be removed by
opening an issue on this repository.

This file is not legal advice.
