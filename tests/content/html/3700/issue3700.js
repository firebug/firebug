function runTest()
{
    FBTest.openNewTab(basePath + "html/3700/issue3700.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");

            // Wait till the inline editor becomes available.
            var config = {tagName: "input", classes: "textEditorInner"};
            FBTest.waitForDisplayedElement("html", config, function(editor)
            {
                function key(k, expected)
                {
                    FBTest.synthesizeKey(k, null, win);
                    var nice = (k === "VK_TAB" ? "tab key" : "'" + k + "'");
                    FBTest.compare(expected, editor.value,
                        (expected ?
                            nice + " should auto-complete to '" + expected + "'" :
                            "tab key should advance to the next field")
                        );
                }

                key("s", "style");
                key("t", "style");
                key("y", "style");
                key("l", "style");
                key("e", "style");
                key("VK_TAB", "");
                key("o", "overflow");
                key("v", "overflow");
                key(":", "overflow: ");
                key("h", "overflow: hidden");
                key("i", "overflow: hidden");
                key(";", "overflow: hidden; ");
                key("c", "overflow: hidden; color");
                key("VK_TAB", "overflow: hidden; color: ");
                key("r", "overflow: hidden; color: red");
                key("VK_TAB", "overflow: hidden; color: red; ");
                var pos = "overflow: hidden; ".length;
                editor.setSelectionRange(pos, pos);
                key("c", "overflow: hidden; color: ; color: red; ");
                key("VK_TAB", "overflow: hidden; color: ; color: red; ");
                key("r", "overflow: hidden; color: red; color: red; ");
                key("e", "overflow: hidden; color: red; color: red; ");
                key("d", "overflow: hidden; color: red; color: red; ");
                key("VK_TAB", "");
                key("s", "spellcheck");
                key("VK_TAB", "");
                key("t", "true");
                key("VK_TAB", "");

                FBTest.compare("overflow: hidden; color: red; color: red;",
                    win.document.body.getAttribute("style"),
                    "style attribute must be correct afterwards");
                FBTest.compare("true", win.document.body.getAttribute("spellcheck"),
                    "spellcheck attribute must be correct afterwards");
                FBTest.testDone();
            });

            // Get the selected element and click ">" to add a new attribute.
            var nodeBox = FBTest.getSelectedNodeBox();
            var addAttrButton = nodeBox.getElementsByClassName("nodeBracket")[0];
            FBTest.click(addAttrButton);
        });
    });
}
