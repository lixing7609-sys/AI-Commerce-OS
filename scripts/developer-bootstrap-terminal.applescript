-- Opens four Terminal.app windows or tabs for the Developer Bootstrap
-- daily workflow. Invoked by developer-bootstrap.sh via
-- `osascript developer-bootstrap-terminal.applescript <cmd1> <cmd2> <cmd3> <cmd4>`.
-- Each argument is a full shell command string for that tab/window. Uses
-- Terminal.app (standard macOS tooling) — no third-party multiplexer.
--
-- Prefers tabs in a single window (via System Events cmd+T), matching
-- the requested "four Terminal windows or tabs" workflow either way.
-- Tab creation needs Terminal/osascript to have Accessibility
-- permission (System Settings > Privacy & Security > Accessibility) to
-- send the cmd+T keystroke; when that permission has not been granted
-- (common on a fresh machine, and in sandboxed/CI environments), macOS
-- raises error -1002 for the keystroke. This script catches that
-- specific failure and falls back to four separate Terminal windows
-- instead, which needs no special permission — the bootstrap still
-- succeeds, just with windows instead of tabs. See
-- docs/02-engineering/developer-bootstrap.md for how to grant the
-- permission if tabs are preferred.

on run argv
	if (count of argv) is not 4 then
		error "expected exactly 4 shell commands (frontend/backend, test watcher, git, claude)"
	end if
	set cmd1 to item 1 of argv
	set cmd2 to item 2 of argv
	set cmd3 to item 3 of argv
	set cmd4 to item 4 of argv
	set cmds to {cmd1, cmd2, cmd3, cmd4}

	tell application "Terminal"
		activate
	end tell

	-- First tab/window always works without any special permission.
	tell application "Terminal"
		if (count of windows) is 0 then
			do script cmd1
		else
			do script cmd1 in front window
		end if
	end tell

	set tabsSucceeded to true
	repeat with i from 2 to 4
		set thisCmd to item i of cmds
		if tabsSucceeded then
			try
				tell application "System Events" to keystroke "t" using command down
				delay 0.3
				tell application "Terminal" to do script thisCmd in front window
			on error errMsg number errNum
				-- -1002: not permitted to send Apple events / keystrokes
				-- (Accessibility permission not granted). Fall back to a
				-- plain new window for this tab and every remaining one.
				set tabsSucceeded to false
				tell application "Terminal" to do script thisCmd
			end try
		else
			tell application "Terminal" to do script thisCmd
		end if
	end repeat

	if not tabsSucceeded then
		log "developer-bootstrap-terminal: Accessibility permission not granted — opened separate windows instead of tabs. Grant Terminal/osascript Accessibility access to get tabs next time."
	end if
end run
