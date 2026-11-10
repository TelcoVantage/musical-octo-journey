#!/usr/bin/env bash
# Builds "Chat - AI Summary to Ticket.i3WorkFlow" for import through the Architect GUI
# (macOS / Linux equivalent of Build-I3WorkFlow.ps1). Archy only reads from your org.
#
#   CLIENT_ID=... CLIENT_SECRET=... ./build-i3workflow.sh
#
# Optional: LOCATION, GENESYS_INTEGRATION_NAME, TICKET_INTEGRATION_NAME, UPDATE_TICKET_ACTION_NAME
set -euo pipefail
: "${CLIENT_ID:?set CLIENT_ID}" "${CLIENT_SECRET:?set CLIENT_SECRET}"
LOCATION="${LOCATION:-mypurecloud.com.au}"
GENESYS_INTEGRATION_NAME="${GENESYS_INTEGRATION_NAME:-Genesys Cloud Data Actions}"
TICKET_INTEGRATION_NAME="${TICKET_INTEGRATION_NAME:-Rabobank ITSM API PROD}"
UPDATE_TICKET_ACTION_NAME="${UPDATE_TICKET_ACTION_NAME:-Update Ticket (v8)}"

here="$(cd "$(dirname "$0")" && pwd)"
archy_dir="$here/.archy"; out_dir="$here/dist"
mkdir -p "$archy_dir" "$out_dir"

if [ ! -x "$archy_dir/archy" ]; then
  case "$(uname -s)" in Darwin) pkg=archy-macos.zip ;; *) pkg=archy-linux.zip ;; esac
  echo "Downloading Archy..."
  curl -fsSL -o "$archy_dir/$pkg" "https://sdk-cdn.mypurecloud.com/archy/latest/$pkg"
  unzip -q -o "$archy_dir/$pkg" -d "$archy_dir"
fi

work="$out_dir/chat-ai-summary-to-ticket.yaml"
GI="$GENESYS_INTEGRATION_NAME" TI="$TICKET_INTEGRATION_NAME" UA="$UPDATE_TICKET_ACTION_NAME" \
python3 - "$here/chat-ai-summary-to-ticket.yaml" "$work" <<'PY'
import os, sys
s = open(sys.argv[1], encoding="utf-8").read()
s = s.replace("                Genesys Cloud Data Actions:", "                %s:" % os.environ["GI"])
s = s.replace("                Rabobank ITSM API PROD:", "                %s:" % os.environ["TI"])
s = s.replace("                    Update Ticket (v8):", "                    %s:" % os.environ["UA"])
open(sys.argv[2], "w", encoding="utf-8").write(s)
PY

(cd "$archy_dir" && ./archy createImportFile --file "$work" --outputDir "$out_dir" --force \
  --clientId "$CLIENT_ID" --clientSecret "$CLIENT_SECRET" --location "$LOCATION")

echo; echo "Import this file in Architect (Save > Import):"; ls -1 "$out_dir"/*.i3WorkFlow
