# Draft: permission request to HolodoriDB / holodori.best

Send this (edit freely) via an issue on https://github.com/HolodoriDB/holodori-db-eng-diff
or through the holodori.best contact / Discord. Delete the parts that do not apply.

---

Hi, and thanks for HolodoriDB and holodori.best - they are the reason a
small project like mine can exist at all. I run **<project name / URL>**, a
free, non-commercial, ad-free fan database and team builder for hololive Dreams.

I would like to ask whether it is OK for my project to use two things you
publish, and on what terms:

1. **Card / skill / song data** from the `holodori-db-eng-diff` repository. My
   backend reads the master tables from `raw.githubusercontent.com` (about
   2 MB, at most once every 6 hours, only when the version changes) and
   converts them into my own database.
2. **Card artwork from `cdn.holodori.dev`.** My backend downloads each full
   illustration (`img_card_full_<id>_unsquished.webp`) once, stores it in my own
   database, and re-checks it with a conditional request (ETag) at most once a
   week. It downloads three at a time, stops after a few failures, and sends no
   special headers. The 5-star animation, signature overlay (`mov_card_sign_*`) and
   voice line (`vo_card_cmn_*_situation`) are *not* copied: the visitor's browser
   streams them from your CDN when they open a card.

What I can offer:

- prominent credit and a link to HolodoriDB / holodori.best in the app and README;
- keeping the project non-commercial and ad-free;
- lower load on your servers if you prefer, for example a different schedule,
  a User-Agent you can filter on, or a mirror / dump you would rather I use;
- switching either part off promptly if you ask (it is a one-line setting:
  `HOLODORI_DATA_SOURCE=none`, `CARD_ART_CDN_BASE=`, `VITE_CARD_VIDEO_BASE=`).

If you would rather I did not use your CDN, I will stop and use only the art I
can obtain elsewhere. Either answer is fine; I just want to do this properly.

Thank you!
<your name / contact>
