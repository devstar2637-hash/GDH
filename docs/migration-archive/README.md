# Original account migration archive

This directory preserves the original GDH repository's public metadata and
all three pull requests before the original account disappears. All original
Git branches, commits and public input files are retained in this repository.
There were no tags, releases, ordinary issues, wiki repository, Actions runs
or artifacts when captured. No Git LFS objects or submodules were found across
the full Git history.

See [the captured PR index](source/README.md), per-PR descriptions, reviews,
comments, timelines, file lists and commit metadata. Diff and multi-commit patch
files are gzip-compressed without truncation to fit GitHub's file limits:

```sh
gunzip -c source/pulls/2/changes.patch.gz > pr-2.patch
```

Original source URLs and authors are deliberately retained as historical
attribution. They are not runtime or deployment dependencies. The archive does
not recreate GitHub review/check IDs, author identities, stars, permissions,
secrets, webhooks or account credentials in the new repository.

The complete local mirror/bundle also includes GitHub's synthetic PR merge
refs. Those refs are archival evidence, not approved changes to merge into main.
The canonical personal repository is https://github.com/rarehotdog/GDH and the
independent engine/UI host is https://thousand-stores-personal.vercel.app.
