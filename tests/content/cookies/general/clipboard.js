function runTest()
{
    FBTest.setPref("cookies.filterByPath", false);

    FBTest.openNewTab(basePath + "cookies/general/clipboard.php", function(win)
    {
        FBTest.openFirebug(true);
        FBTest.enableCookiesPanel(function(win)
        {
            FBTest.sysout("cookies.general.cookieClipboard; Check clipboard functionality");

            // Make sure the Cookie panel's UI is there.
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            // Copy cookie into the clipboard, get from clipboard again and check.
            var originalCookie = FBTest.getCookieByName(panelNode, "CopyPasteCookie");
            FBTest.ok(originalCookie, "There must be 'CopyPasteCookie'.");
            if (!originalCookie)
                return FBTest.testDone();

            // Helper shortcut
            var CookieRow = FW.Firebug.CookieModule.CookieReps.CookieRow;

            // Expected clipboard value
            var clipboardValue = "CopyPasteCookie=Test+Cookie+Value; expires=Wed, " +
                "18 May 2033 03:33:20 GMT; path=/dir; domain=" + win.location.host;

            function copyCookie()
            {
                // Copy & Paste
                CookieRow.onCopy(originalCookie);
            }

            FBTest.waitForClipboard(clipboardValue, copyCookie, function()
            {
                CookieRow.onPaste(null);

                // Check the new cookie
                var newCookie = FBTest.getCookieByName(panelNode, "CopyPasteCookie-1");
                FBTest.ok(newCookie, "There must be 'CopyPasteCookie-1'.");
                if (!originalCookie || !newCookie)
                    return FBTest.testDone();

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
                newCookie = FBTest.getCookieByName(panelNode, "CopyPasteCookie-1");
                FBTest.ok(!newCookie, "There must not be 'CopyPasteCookie-1'.");

                return FBTest.testDone();
            });
        });
    });
};
