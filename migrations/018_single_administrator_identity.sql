-- Keep the administrative control plane bound to exactly one human account.
-- Cloudflare Access provides the outer identity check; this database invariant
-- prevents a second in-application ADMIN from being introduced by another code
-- path or a race between operator commands.

DO $$
BEGIN
  IF (SELECT count(*) FROM user_roles WHERE role_code = 'ADMIN') > 1 THEN
    RAISE EXCEPTION 'cannot enforce single administrator: multiple ADMIN roles exist'
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE UNIQUE INDEX user_roles_single_administrator_idx
  ON user_roles (role_code)
  WHERE role_code = 'ADMIN';
