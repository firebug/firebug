function runTest()
{
    FBTest.openNewTab(basePath + "html/style/5461/issue5461.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element", function(node)
            {
                var panel = FBTest.selectSidePanel("css");

                FBTest.synthesizeMouse(panel.panelNode);
                FBTest.sendShortcut("a", {accelKey: true});

                function copy()
                {
                    FBTest.setClipboardText("issue5461");
                }

                var expected = new RegExp("#element\\s+\\{[\\r\\n]{1,2}"+
                    "\\s+background:\\s+-moz-linear-gradient\\(135deg, #788cff, #b4c8ff\\) repeat "+
                    "scroll 0 0 #8c8cff;[\\r\\n]{1,2}"+
                    "\\s+height:\\s+100px;[\\r\\n]{1,2}"+
                    "\\s+width:\\s+100px;[\\r\\n]{1,2}"+
                    "\\}[\\r\\n]{1,2}"+
                    "\\*\\s+\{[\\r\\n]{1,2}"+
                    "\\s+position: relative;[\\r\\n]{1,2}"+
                    "\\}[\\r\\n]{1,2}"+
                    "body\\s+\\\{[\\r\\n]{1,2}"+
                    "\\s+font-family:\\s+\\\"Trebuchet MS\\\",Helvetica,sans-serif;[\\r\\n]{1,2}"+
                    "\\s+font-size:\\s+0.9em;[\\r\\n]{1,2}"+
                    "\\}");

                FBTest.waitForClipboard(expected, copy, function(cssDecl)
                {
                    FBTest.compare(expected, cssDecl,
                        "CSS declaration must be properly copied into the clipboard");
                    FBTest.testDone();
                });

                FBTest.sendShortcut("c", {accelKey: true});
            });
        });
    });
}
