function runTest()
{
    FBTest.openNewTab(basePath + "dom/1738/issue1738.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.waitForDOMProperty("_testProperty", function(row)
            {
                var propLabel = row.getElementsByClassName("memberLabel")[0];
                FBTest.compare("_testProperty", propLabel.textContent, "Property name must not be prefixed by 'get'");

                var propValue = row.getElementsByClassName("memberValueCell")[0];
                FBTest.dblclick(propValue);

                var panel = FBTest.getPanelDocument();
                var editor = panel.getElementsByClassName("completionInput")[0];
                if (FBTest.ok(editor, "Property must be editable"))
                {
                    FBTest.compare('"Hello Firebug user!"', editor.value,
                        "Inline editor should be opened and contain \"Hello Firebug user!\"");

                    FBTest.click(editor.parentNode);
                }

                FBTest.testDone();
            });

            FBTest.selectPanel("dom");
        });
    });
}
