function runTest()
{
    FBTest.openNewTab(basePath + "firebug/5349/issue5349.html", function(win)
    {
        var target = win.document.getElementById("selectbox");
        FBTest.executeContextMenuCommand(target, "menu_firebug_firebugInspect", function()
        {
            FBTest.testDone();
        });
    });
}
