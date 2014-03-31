function runTest()
{
    FBTest.openNewTab(basePath + "html/2183/issue2183.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");

            // Show cropped text for this test
            FBTest.setPref("showFullTextNodes", false);

            FBTest.selectElementInHtmlPanel("paragraph", function(node)
            {
                var paragraph = node.getElementsByClassName("nodeText").item(0);
                FBTest.compare(/Lorem.*?\.\.\..*?voluptua\./, paragraph.textContent,
                    "Node contents in HTML panel must be cropped");

                FBTest.synthesizeMouse(paragraph);

                var editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                if (FBTest.ok(editor, "Editor must be available now"))
                {
                    FBTest.compare(/^(?!.*\.\.\.)/, editor.value,
                        "Node contents in HTML panel must not be cropped in inline editor");


                    var config = {
                        tagName: "div",
                        classes: "nodeBox textNodeBox mutated"
                    };

                    FBTest.waitForDisplayedElement("html", config, function(node)
                    {
                        paragraph = node.getElementsByClassName("nodeText").item(0);
                        FBTest.compare(/Loram.*?\.\.\..*?voluptua\./, paragraph.textContent,
                            "Node contents in HTML panel must be cropped and contain 'Loram'");

                        FBTest.compare(/^Loram(?!.*\.\.\.)/, win.document.getElementById("paragraph").textContent,
                            "Node contents on page must not be cropped and contain 'Loram'");

                        FBTest.testDone();
                    });

                    FBTest.sendKey("HOME", editor);
                    FBTest.sendKey("LEFT", editor);
                    // Move text cursor before the 'e' of 'Lorem'
                    for (var i=0; i<3; i++)
                        FBTest.sendKey("RIGHT", editor);

                    // Delete the 'e' of 'Lorem'
                    FBTest.sendKey("DELETE", editor);

                    // Enter a single quote
                    FBTest.sendChar("a", editor);

                    FBTest.synthesizeMouse(panel.panelNode);
                }
            });
        });
    });
}
