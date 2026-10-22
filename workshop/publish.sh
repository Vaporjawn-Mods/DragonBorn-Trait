#!/bin/bash
# Publishes this mod to its existing Steam Workshop item (CK3, app 1158310).
#   ./workshop/publish.sh --dry-run   stage + validate + write the VDF, upload nothing
#   ./workshop/publish.sh             do the above, then upload with steamcmd
# Run the real upload in YOUR terminal: steamcmd asks for the Steam password and
# Steam Guard code on the first login (it has no cached login on this Mac yet).
# steamcmd only runs under Rosetta on this Mac, hence `arch -x86_64`.
set -euo pipefail
cd "$(dirname "$0")/.."
APPID=1158310
ITEM=2759933312
STEAM_USER="${STEAM_USER:-vwizzle12}"   # account that owns the item (persona: Vaporjawn)
STAGE="$HOME/.cache/ck3-workshop/dragonborn-trait"
VDF="$HOME/.cache/ck3-workshop/dragonborn-trait.vdf"

grep -q "remote_file_id=\"$ITEM\"" descriptor.mod || { echo "descriptor.mod remote_file_id is not $ITEM"; exit 1; }
grep -q 'supported_version="1.20' descriptor.mod || { echo "descriptor.mod supported_version is not 1.20.*"; exit 1; }
for f in common/traits/*.txt localization/english/*.yml; do
  [ "$(head -c 3 "$f" | xxd -p)" = "efbbbf" ] || { echo "missing UTF-8 BOM: $f"; exit 1; }
done

rm -rf "$STAGE"; mkdir -p "$STAGE"
rsync -a --exclude '.git' --exclude '.gitattributes' --exclude 'workshop' --exclude '.DS_Store' ./ "$STAGE/"
{
  echo '"workshopitem"'; echo '{'
  echo "	\"appid\"		\"$APPID\""
  echo "	\"publishedfileid\"		\"$ITEM\""
  echo "	\"contentfolder\"		\"$STAGE\""
  printf '	"changenote"		"%s"\n' "$(sed 's/"/\\"/g' workshop/CHANGENOTES.txt)"
  printf '	"description"		"%s"\n' "$(sed 's/"/\\"/g' workshop/DESCRIPTION.txt)"
  echo "	\"previewfile\"		\"$PWD/workshop/images/banner-preview.jpg\""
  echo '}'
} > "$VDF"

echo "Staged: $STAGE"; (cd "$STAGE" && find . -type f | sort)
echo "VDF:    $VDF"
[ "${1:-}" = "--dry-run" ] && { echo "Dry run: nothing uploaded."; exit 0; }
exec arch -x86_64 steamcmd +login "$STEAM_USER" +workshop_build_item "$VDF" +quit
