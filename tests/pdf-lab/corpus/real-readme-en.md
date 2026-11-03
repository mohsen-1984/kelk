# Field Notes Sync

A small desktop tool that copies field survey notes from a tablet to the office archive and checks that nothing was lost on the way.

## Requirements

- Windows 10 or 11, or any Linux with Python 3.11
- About 200 MB of free disk space for the local cache
- Network access to the archive share

## Installation

1. Download the latest release and unpack it into a folder of your choice.
2. Copy the file settings.example.ini to settings.ini and enter the address of the archive share.
3. Run the setup once as an administrator so that the background service is registered.

## Daily use

Connect the tablet with its cable and wait until the tray icon turns green. The tool then copies every new note, compares the checksums of both copies and writes a short line into the sync log. Notes that fail the check are kept on the tablet and shown in red, so they can be copied again later.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| archive_path | (none) | The folder on the share that receives the notes |
| keep_days | 30 | How long copied notes stay on the tablet |
| verify | yes | Compare checksums after every copy |
| log_level | info | How much detail the sync log records |

## Known limits

Very large photo attachments, over 2 GB each, are skipped and listed in the log. The tool does not merge two notes edited on different tablets; the newer copy wins and the older one is kept with a .old suffix.

## Licence

The text of this readme is released into the public domain (CC0 1.0).
