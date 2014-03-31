function runTest()
{
    var variableName = "veryLongVariableNameToTestNameCropping";

    FBTest.openNewTab(basePath + "script/watch/7300/issue7300.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enableScriptPanel(() =>
            {
                var panelNode = FBTest.selectPanel("watches").panelNode;
                FBTest.addWatchExpression(null, variableName,
                    (value) =>
                {
                    var row = FW.FBL.getAncestorByClass(value, "memberRow");
                    var labelBox = row.getElementsByClassName("memberLabelBox")[0];

                    var croppedVariableName = FW.FBL.cropString(variableName, 25);
                    FBTest.compare(croppedVariableName, labelBox.textContent,
                        "Expression name must be cropped");

                    FBTest.executeContextMenuCommand(row, "EditDOMProperty", () =>
                    {
                        var editor = panelNode.getElementsByClassName("fixedWidthEditor completionInput")[0];
                        if (FBTest.ok(editor, "The editor must be there"))
                        {
                            FBTest.compare(variableName, editor.value,
                                "Full value must be displayed within the editor");
                        }
                        FBTest.testDone();
                    });
                });
            });
        });
    });
}
