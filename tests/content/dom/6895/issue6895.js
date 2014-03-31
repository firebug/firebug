function runTest()
{
    FBTest.openNewTab(basePath + "dom/6895/issue6895.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.waitForDOMProperty("testString", function(row)
            {
                var memberValueElement = row.getElementsByClassName("memberValueCell")[0];

                FBTest.dblclick(memberValueElement);

                var panel = FBTest.getPanelDocument();
                var editorInput = panel.getElementsByClassName("completionInput")[0];

                FBTest.compare("\"Test text\"", editorInput.value,
                    "The editor's value should be encapsulated in double quotes");

                var selectedText = editorInput.value.substring(editorInput.selectionStart, editorInput.selectionEnd);
                FBTest.compare("Test text", selectedText,
                    "Only the text inside the double quotes should be selected");

                FBTest.click(editorInput.parentNode);

                FBTest.testDone();
            });

            FBTest.selectPanel("dom");
        });
    });
}
