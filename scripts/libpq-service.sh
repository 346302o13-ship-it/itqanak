#!/usr/bin/env bash

# Shared, source-only helpers for turning a PostgreSQL connection URI into a
# private libpq service file. Connection URIs must never be passed to client
# argv or exported to child processes.

ITQANAK_LIBPQ_ERROR=""
ITQANAK_LIBPQ_SERVICE_DIRECTORY=""
ITQANAK_LIBPQ_SERVICE_FILE=""
ITQANAK_LIBPQ_SERVICE_NAME=""
ITQANAK_LIBPQ_DSN=""
ITQANAK_LIBPQ_OWNS_DIRECTORY="0"

itqanak_take_secret() {
  local direct_name="$1"
  local output_name="$2"
  local file_name="${direct_name}_FILE"
  local file_path="${!file_name:-}"
  local secret_value
  export -n secret_value
  secret_value="${!direct_name:-}"

  # Imported environment variables retain their export attribute. Remove them
  # in the parent shell before any external program can be started.
  unset "$direct_name" "$file_name"

  if [[ -n "$file_path" ]]; then
    if [[ ! -f "$file_path" || ! -r "$file_path" ]]; then
      ITQANAK_LIBPQ_ERROR="required database secret file is not readable"
      return 1
    fi
    secret_value="$(<"$file_path")"
    secret_value="${secret_value%$'\r'}"
  fi

  if [[ -z "$secret_value" ]]; then
    ITQANAK_LIBPQ_ERROR="database configuration is required"
    return 1
  fi
  if [[ "$secret_value" == *$'\n'* || "$secret_value" == *$'\r'* ]]; then
    ITQANAK_LIBPQ_ERROR="database configuration must contain exactly one line"
    return 1
  fi

  export -n "$output_name"
  printf -v "$output_name" '%s' "$secret_value"
}

itqanak_forget_database_url_inputs() {
  unset DATABASE_URL DATABASE_URL_FILE
  unset RESTORE_DATABASE_URL RESTORE_DATABASE_URL_FILE
  unset VERIFY_DATABASE_URL VERIFY_DATABASE_URL_FILE
}

itqanak_reset_libpq_environment() {
  unset PGAPPNAME PGCHANNELBINDING PGCLIENTENCODING PGCONNECT_TIMEOUT
  unset PGDATABASE PGGSSDELEGATION PGGSSLIB PGGSSENCMODE PGHOST PGHOSTADDR PGKRBSRVNAME
  unset PGLOADBALANCEHOSTS PGOPTIONS PGPASSFILE PGPASSWORD PGPORT
  unset PGREQUIREAUTH PGREQUIREPEER PGREQUIRESSL PGSERVICE PGSERVICEFILE
  unset PGSSLCERT PGSSLCERTMODE PGSSLCOMPRESSION PGSSLCRL PGSSLCRLDIR
  unset PGSSLKEY PGSSLKEYLOGFILE PGSSLMAXPROTOCOLVERSION PGSSLMINPROTOCOLVERSION
  unset PGSSLMODE PGSSLNEGOTIATION PGSSLROOTCERT PGSSLSNI
  unset PGSYSCONFDIR PGTARGETSESSIONATTRS PGUSER
}

itqanak_uri_decode() {
  local encoded="$1"
  local output_name="$2"
  local decoded=""
  local prefix hex byte
  local LC_ALL=C

  while [[ "$encoded" == *%* ]]; do
    prefix="${encoded%%\%*}"
    decoded+="$prefix"
    encoded="${encoded#*%}"
    if (( ${#encoded} < 2 )) || [[ ! "${encoded:0:2}" =~ ^[0-9A-Fa-f]{2}$ ]]; then
      ITQANAK_LIBPQ_ERROR="database URI contains invalid percent encoding"
      return 1
    fi
    hex="${encoded:0:2}"
    if [[ "$hex" == "00" ]]; then
      ITQANAK_LIBPQ_ERROR="database URI contains a forbidden null byte"
      return 1
    fi
    printf -v byte '%b' "\\x${hex}"
    decoded+="$byte"
    encoded="${encoded:2}"
  done
  decoded+="$encoded"
  printf -v "$output_name" '%s' "$decoded"
}

itqanak_validate_service_value() {
  local value="$1"
  local LC_ALL=C

  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    ITQANAK_LIBPQ_ERROR="database URI contains a line break"
    return 1
  fi
  # Keep serialization fail-closed around INI whitespace rules rather than
  # relying on subtle parser behavior for credential boundaries.
  if [[ -n "$value" && ( "$value" == [[:space:]]* || "$value" == *[[:space:]] ) ]]; then
    ITQANAK_LIBPQ_ERROR="database URI contains a parameter beginning or ending in whitespace"
    return 1
  fi
  if (( ${#value} > 900 )); then
    ITQANAK_LIBPQ_ERROR="database URI contains an overlong parameter"
    return 1
  fi
}

itqanak_is_libpq_keyword() {
  case "$1" in
    user | password | passfile | channel_binding | connect_timeout | dbname | host | hostaddr | port | client_encoding | options | application_name | fallback_application_name | keepalives | keepalives_idle | keepalives_interval | keepalives_count | tcp_user_timeout | sslmode | sslnegotiation | sslcompression | sslcert | sslkey | sslcertmode | sslpassword | sslrootcert | sslcrl | sslcrldir | sslsni | requirepeer | require_auth | ssl_min_protocol_version | ssl_max_protocol_version | gssencmode | krbsrvname | gsslib | gssdelegation | replication | target_session_attrs | load_balance_hosts)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

itqanak_parse_host_component() {
  local component="$1"
  local host_output="$2"
  local port_output="$3"
  local encoded_host=""
  local encoded_port=""
  local remainder=""
  local parsed_host=""
  local parsed_port=""

  if [[ "$component" == \[* ]]; then
    if [[ "$component" != *\]* ]]; then
      ITQANAK_LIBPQ_ERROR="database URI has an unterminated IPv6 host"
      return 1
    fi
    encoded_host="${component#\[}"
    encoded_host="${encoded_host%%\]*}"
    [[ -n "$encoded_host" ]] || {
      ITQANAK_LIBPQ_ERROR="database URI contains an empty IPv6 host"
      return 1
    }
    remainder="${component#*\]}"
    if [[ -n "$remainder" ]]; then
      [[ "$remainder" == :* ]] || {
        ITQANAK_LIBPQ_ERROR="database URI contains an invalid IPv6 host suffix"
        return 1
      }
      encoded_port="${remainder#:}"
    fi
  else
    if [[ "$component" == *:* ]]; then
      encoded_host="${component%%:*}"
      encoded_port="${component#*:}"
      if [[ "$encoded_port" == *:* ]]; then
        ITQANAK_LIBPQ_ERROR="IPv6 database hosts must be enclosed in brackets"
        return 1
      fi
    else
      encoded_host="$component"
    fi
  fi

  itqanak_uri_decode "$encoded_host" parsed_host || return 1
  itqanak_uri_decode "$encoded_port" parsed_port || return 1
  itqanak_validate_service_value "$parsed_host" || return 1
  itqanak_validate_service_value "$parsed_port" || return 1
  printf -v "$host_output" '%s' "$parsed_host"
  printf -v "$port_output" '%s' "$parsed_port"
}

itqanak_write_libpq_service() {
  local database_uri="$1"
  local service_file="$2"
  local service_name="$3"
  local database_name_override="${4:-}"
  local remainder authority path query=""
  local userinfo hostspec encoded_user encoded_password
  local decoded_user decoded_password decoded_dbname
  local host_list="" port_list=""
  local component decoded_host decoded_port separator="" remaining_hosts has_more
  local pair encoded_key encoded_value key value
  local -A parameters=()
  local -a output_order=(
    user password passfile channel_binding connect_timeout dbname host hostaddr port
    client_encoding options application_name fallback_application_name keepalives
    keepalives_idle keepalives_interval keepalives_count tcp_user_timeout sslmode
    sslnegotiation sslcompression sslcert sslkey sslcertmode sslpassword sslrootcert
    sslcrl sslcrldir sslsni requirepeer require_auth ssl_min_protocol_version
    ssl_max_protocol_version gssencmode krbsrvname gsslib gssdelegation replication
    target_session_attrs load_balance_hosts
  )

  case "$database_uri" in
    postgresql://*) remainder="${database_uri#postgresql://}" ;;
    postgres://*) remainder="${database_uri#postgres://}" ;;
    *)
      ITQANAK_LIBPQ_ERROR="database configuration must be a postgresql:// URI"
      return 1
      ;;
  esac

  if [[ "$remainder" == *\?* ]]; then
    query="${remainder#*\?}"
    remainder="${remainder%%\?*}"
  fi
  if [[ "$remainder" == */* ]]; then
    authority="${remainder%%/*}"
    path="${remainder#*/}"
  else
    authority="$remainder"
    path=""
  fi

  if [[ "$authority" == *@* ]]; then
    [[ "${authority#*@}" != *@* ]] || {
      ITQANAK_LIBPQ_ERROR="database URI contains an unescaped at sign"
      return 1
    }
    userinfo="${authority%%@*}"
    hostspec="${authority#*@}"
    if [[ "$userinfo" == *:* ]]; then
      encoded_user="${userinfo%%:*}"
      encoded_password="${userinfo#*:}"
    else
      encoded_user="$userinfo"
      encoded_password=""
    fi
    itqanak_uri_decode "$encoded_user" decoded_user || return 1
    itqanak_uri_decode "$encoded_password" decoded_password || return 1
    itqanak_validate_service_value "$decoded_user" || return 1
    itqanak_validate_service_value "$decoded_password" || return 1
    [[ -z "$decoded_user" ]] || parameters[user]="$decoded_user"
    [[ -z "$decoded_password" ]] || parameters[password]="$decoded_password"
  else
    hostspec="$authority"
  fi

  remaining_hosts="$hostspec"
  while :; do
    if [[ "$remaining_hosts" == *,* ]]; then
      component="${remaining_hosts%%,*}"
      remaining_hosts="${remaining_hosts#*,}"
      has_more="1"
    else
      component="$remaining_hosts"
      remaining_hosts=""
      has_more="0"
    fi
    itqanak_parse_host_component "$component" decoded_host decoded_port || return 1
    host_list+="${separator}${decoded_host}"
    port_list+="${separator}${decoded_port}"
    separator=","
    [[ "$has_more" == "1" ]] || break
  done
  itqanak_validate_service_value "$host_list" || return 1
  itqanak_validate_service_value "$port_list" || return 1
  [[ -z "$host_list" ]] || parameters[host]="$host_list"
  [[ -z "$port_list" ]] || parameters[port]="$port_list"

  itqanak_uri_decode "$path" decoded_dbname || return 1
  itqanak_validate_service_value "$decoded_dbname" || return 1
  [[ -z "$decoded_dbname" ]] || parameters[dbname]="$decoded_dbname"
  if [[ -n "$database_name_override" ]]; then
    [[ "$database_name_override" =~ ^itqanak_restore_[a-z0-9_]+$ ]] || {
      ITQANAK_LIBPQ_ERROR="database name override must identify a dedicated restore database"
      return 1
    }
    parameters[dbname]="$database_name_override"
  fi

  while [[ -n "$query" ]]; do
    if [[ "$query" == *'&'* ]]; then
      pair="${query%%&*}"
      query="${query#*&}"
    else
      pair="$query"
      query=""
    fi
    if [[ "$pair" != *=* || "${pair#*=}" == *=* ]]; then
      ITQANAK_LIBPQ_ERROR="database URI contains an invalid query parameter"
      return 1
    fi
    encoded_key="${pair%%=*}"
    encoded_value="${pair#*=}"
    itqanak_uri_decode "$encoded_key" key || return 1
    itqanak_uri_decode "$encoded_value" value || return 1

    if [[ "$key" == "ssl" && "$value" == "true" ]]; then
      key="sslmode"
      value="require"
    elif [[ "$key" == "requiressl" ]]; then
      key="sslmode"
      if [[ "$value" == 1* ]]; then
        value="require"
      else
        value="prefer"
      fi
    fi
    [[ "$key" != "service" ]] || {
      ITQANAK_LIBPQ_ERROR="nested database service parameters are not supported"
      return 1
    }
    itqanak_is_libpq_keyword "$key" || {
      ITQANAK_LIBPQ_ERROR="database URI contains an unsupported connection parameter"
      return 1
    }
    itqanak_validate_service_value "$value" || return 1
    parameters["$key"]="$value"
  done

  {
    printf '[%s]\n' "$service_name"
    for key in "${output_order[@]}"; do
      if [[ -v "parameters[$key]" ]]; then
        printf '%s=%s\n' "$key" "${parameters[$key]}"
      fi
    done
  } >"$service_file"
}

itqanak_create_libpq_service() {
  local database_uri
  local service_name="$2"
  local database_name_override="${3:-}"
  local temporary_root="${TMPDIR:-/tmp}"

  # Bash locals can inherit an exported attribute from an identically named
  # caller variable. Clear it before the URI is assigned and before mktemp or
  # chmod is launched.
  export -n database_uri
  database_uri="$1"
  itqanak_forget_database_url_inputs
  umask 077

  [[ "$service_name" =~ ^[a-zA-Z0-9_-]+$ ]] || {
    ITQANAK_LIBPQ_ERROR="invalid internal database service name"
    return 1
  }

  itqanak_reset_libpq_environment
  ITQANAK_LIBPQ_SERVICE_DIRECTORY="$(mktemp -d "${temporary_root%/}/itqanak-libpq.XXXXXX")" || {
    ITQANAK_LIBPQ_ERROR="could not create private database service directory"
    return 1
  }
  ITQANAK_LIBPQ_SERVICE_FILE="${ITQANAK_LIBPQ_SERVICE_DIRECTORY}/pg_service.conf"
  ITQANAK_LIBPQ_OWNS_DIRECTORY="1"
  if ! chmod 700 "$ITQANAK_LIBPQ_SERVICE_DIRECTORY"; then
    ITQANAK_LIBPQ_ERROR="could not protect database service directory"
    itqanak_destroy_libpq_service
    return 1
  fi
  ITQANAK_LIBPQ_SERVICE_NAME="$service_name"
  ITQANAK_LIBPQ_DSN="service=${service_name}"

  if ! itqanak_write_libpq_service \
    "$database_uri" "$ITQANAK_LIBPQ_SERVICE_FILE" "$service_name" "$database_name_override"; then
    itqanak_destroy_libpq_service
    return 1
  fi
  if ! chmod 600 "$ITQANAK_LIBPQ_SERVICE_FILE"; then
    ITQANAK_LIBPQ_ERROR="could not protect database service file"
    itqanak_destroy_libpq_service
    return 1
  fi
  export PGSERVICEFILE="$ITQANAK_LIBPQ_SERVICE_FILE"
  export PGSERVICE="$ITQANAK_LIBPQ_SERVICE_NAME"
}

itqanak_use_existing_libpq_service() {
  local service_file="$1"
  local service_name="$2"
  local service_mode

  itqanak_forget_database_url_inputs
  itqanak_reset_libpq_environment

  [[ -f "$service_file" && -r "$service_file" ]] || {
    ITQANAK_LIBPQ_ERROR="internal database service file is not readable"
    return 1
  }
  [[ "$service_name" =~ ^[a-zA-Z0-9_-]+$ ]] || {
    ITQANAK_LIBPQ_ERROR="invalid internal database service name"
    return 1
  }
  service_mode="$(stat -c '%a' "$service_file")" || {
    ITQANAK_LIBPQ_ERROR="internal database service file mode could not be read"
    return 1
  }
  [[ "$service_mode" == "600" ]] || {
    ITQANAK_LIBPQ_ERROR="internal database service file is not private"
    return 1
  }

  ITQANAK_LIBPQ_SERVICE_DIRECTORY=""
  ITQANAK_LIBPQ_SERVICE_FILE="$service_file"
  ITQANAK_LIBPQ_SERVICE_NAME="$service_name"
  ITQANAK_LIBPQ_DSN="service=${service_name}"
  ITQANAK_LIBPQ_OWNS_DIRECTORY="0"
  export PGSERVICEFILE="$ITQANAK_LIBPQ_SERVICE_FILE"
  export PGSERVICE="$ITQANAK_LIBPQ_SERVICE_NAME"
}

itqanak_destroy_libpq_service() {
  local service_file="$ITQANAK_LIBPQ_SERVICE_FILE"
  local service_directory="$ITQANAK_LIBPQ_SERVICE_DIRECTORY"

  unset PGSERVICEFILE PGSERVICE
  if [[ "$ITQANAK_LIBPQ_OWNS_DIRECTORY" == "1" && -n "$service_directory" && "$service_file" == "${service_directory}/pg_service.conf" ]]; then
    if [[ -f "$service_file" ]]; then
      : >"$service_file"
      rm -f -- "$service_file" || true
    fi
    if [[ -d "$service_directory" ]]; then
      rmdir -- "$service_directory" || true
    fi
  fi
  ITQANAK_LIBPQ_SERVICE_DIRECTORY=""
  ITQANAK_LIBPQ_SERVICE_FILE=""
  ITQANAK_LIBPQ_SERVICE_NAME=""
  ITQANAK_LIBPQ_DSN=""
  ITQANAK_LIBPQ_OWNS_DIRECTORY="0"
}
