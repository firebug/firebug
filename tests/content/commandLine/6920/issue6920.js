function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/6920/issue6920.html", function(win)
    {
        FBTest.enablePanels(["console"], function()
        {
            var CommandEditor = FW.Firebug.CommandEditor;
            CommandEditor.setText("function test() { return true; }", true);

            var context = FW.Firebug.currentContext;
            CommandEditor.prettyPrint(context).then((code) =>
            {
                var expected = "function test() {\n  return true;\n}\n";
                FBTest.compare(expected, code, "The code must be formatted");
                FBTest.testDone();
            });
        });
    });
}
