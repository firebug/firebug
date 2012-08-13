function runTest()
{
    FBTest.sysout("issue5755.START");

    FBTest.openNewTab(basePath + "html/5755/issue5755.html", function (win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("html");
        if (FBTest.ok(panel, "Firebug must be opened and switched to HTML panel now."))
        {
            FBTest.setPref("showFullTextNodes", false);
            FBTest.selectElementInHtmlPanel("long-onclick", function (nodes)
            {
                // getting onclike attribute's value
                var onclickValue = nodes.getElementsByClassName("nodeValue").item(1);
                FBTest.synthesizeMouse(onclickValue);
                var texteditor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                if (FBTest.ok(texteditor, "Editor must be loaded now"))
                {
                    if (FBTest.ok(texteditor.value.indexOf("..") < 0,
                        "Inline editor must be filled with whole string of onclick attribute value"))
                    {
                        FBTest.testDone("issue5755.DONE");
                    }
                }
            });
        }
        else
        {
            FBTest.testDone("issue5755.FAILED.");
        }
    });
}