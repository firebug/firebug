function runTest()
{
    FBTest.sysout("cookies.test.cookieClipboard; START");

    FBTestFirebug.openNewTab(basePath + "cookies/general/cookieClipboard.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookies.test.cookieClipboard; Check clipboard functionality");

            // Make sure the Cookie panel's UI is there.
            FBTestFirebug.openFirebug(true);
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            // Copy cookie into the clipboard, get from clipboard again and check.
            var originalCookie = FBTestFireCookie.getCookieByName(panelNode, "CopyPasteCookie");
            FBTest.ok(originalCookie, "There must be 'CopyPasteCookie'.");
            if (!originalCookie)
                return FBTestFirebug.testDone();

            // Helper shortcut
            var CookieRow = FW.Firebug.CookieModule.CookieReps.CookieRow;

            // Copy & Paste
            CookieRow.onCopy(originalCookie);
            CookieRow.onPaste(null);

            // Check the new cookie
            var newCookie = FBTestFireCookie.getCookieByName(panelNode, "CopyPasteCookie-1");
            FBTest.ok(newCookie, "There must be 'CopyPasteCookie-1'.");
            if (!originalCookie || !newCookie)
                return FBTestFirebug.testDone();

            FBTest.compare(originalCookie.value, newCookie.value, "The value must be the same.");
            FBTest.compare(originalCookie.isDomain, newCookie.isDomain, "The isDomain must be the same.");
            FBTest.compare(originalCookie.host, newCookie.host, "The host must be the same.");
            FBTest.compare(originalCookie.path, newCookie.path, "The path must be the same.");
            FBTest.compare(originalCookie.isSecure, newCookie.isSecure, "The isSecure must be the same.");
            FBTest.compare(originalCookie.expires, newCookie.expires, "The expires must be the same.");
            FBTest.compare(originalCookie.isHttpOnly, newCookie.isHttpOnly, "The isHttpOnly must be the same.");
            FBTest.compare(originalCookie.rawValue, newCookie.rawValue, "The rawValue must be the same.");

            // Delete the cookie
            CookieRow.onRemove(newCookie);
            newCookie = FBTestFireCookie.getCookieByName(panelNode, "CopyPasteCookie-1");
            FBTest.ok(!newCookie, "There must not be 'CopyPasteCookie-1'.");

            return FBTestFirebug.testDone("cookies.test.cookiePaste; DONE");
        });
    });
};
