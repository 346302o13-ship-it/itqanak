# ADR 0010: Argon2id password hashing

## Decision

Credentials use Argon2id with a 19 MiB memory cost, time cost 2, parallelism 1,
and a 32-byte output. This gives a meaningful memory-hard cost while remaining
appropriate for the 4 GB deployment target when protected by Redis rate limits.

## Consequences

Passwords are accepted as 12–128-character passphrases without composition
rules, never truncated, logged, or stored reversibly. The parameters are covered
by a repeatable benchmark command and can be raised through a future migration of
credential hashes.
