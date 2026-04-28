#!/bin/sh
set -e
# Launches the electron-builder bundle under Electron BaseApp (Zypak sandbox helper).
exec zypak-wrapper.sh /app/lib/linux-dev-home/linux-dev-home "$@"
