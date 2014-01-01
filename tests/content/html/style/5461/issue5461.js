function runTest()
{
    FBTest.sysout("issue5461.START");

    FBTest.openNewTab(basePath + "html/style/5461/issue5461.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        FBTest.selectElementInHtmlPanel("element", function(node)
        {
            var panel = FBTest.selectSidePanel("css");

            FBTest.synthesizeMouse(panel.panelNode);
            FBTest.sendShortcut("a", {accelKey: true});

            // Reset clipboard content
            FBTest.setClipboardText("issue5461");
            FBTest.waitForClipboard("issue5461", function()
            {
                var expected = new RegExp("#element\\s+\\{[\\r\\n]{1,2}"+
                    "\\s+background:\\s+-moz-linear-gradient\\(135deg, #788CFF, #B4C8FF\\) repeat "+
                    "scroll 0 0 #8C8CFF;[\\r\\n]{1,2}"+
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

                FBTest.waitForClipboard(expected, function(cssDecl)
                {
                    FBTest.compare(expected, cssDecl,
                        "CSS declaration must be properly copied into the clipboard");
                    FBTest.testDone("issue5461.DONE");
                });

                FBTest.sendShortcut("c", {accelKey: true});
            });

        });
    });
}
