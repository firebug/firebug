function runTest()
{
    FBTest.openNewTab(basePath + "html/4826/issue4826.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");

            FBTest.selectElementInHtmlPanel("testnode", function(node)
            {
                var idAttributeValue = node.getElementsByClassName("nodeValue").item(0);

                FBTest.synthesizeMouse(idAttributeValue);

                var editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                if (FBTest.ok(editor, "Editor must be available now"))
                {
                    FBTest.sendString("foo", editor);

                    FBTest.synthesizeMouse(panel.panelNode);

                    var chrome = FW.Firebug.chrome;
                    var elementPathItems = chrome.window.document.
                        getElementsByClassName("panelStatusLabel");

                    FBTest.compare("div#foo", elementPathItems.item(0).label,
                        "The label of the node inside the Element Path must now be 'div#foo'");

                    FBTest.synthesizeMouse(elementPathItems.item(1));

                    var selectedElement = panel.panelNode.getElementsByClassName("nodeBox selected").
                        item(0);
                    var selectedElementTagName = selectedElement.firstChild.
                        getElementsByClassName("nodeTag").item(0).textContent;
                    var selectedElementId = selectedElement.firstChild.
                    getElementsByClassName("nodeValue").item(0).textContent;
                    FBTest.compare(elementPathItems.item(1).label, selectedElementTagName+"#"+
                        selectedElementId, elementPathItems.item(1).label+" must now be selected");

                    FBTest.synthesizeMouse(idAttributeValue);

                    var editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                    if (FBTest.ok(editor, "Editor must be available now"))
                    {
                        FBTest.sendString("bar", editor);

                        FBTest.synthesizeMouse(panel.panelNode);

                        FBTest.compare("div#bar", elementPathItems.item(0).label,
                            "The label of the node inside the Element Path must now be 'div#bar'");
                    }
                }

                FBTest.testDone();
            });
        });
    });
}
