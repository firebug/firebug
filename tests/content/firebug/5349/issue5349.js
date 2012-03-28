function runTest()
{
    FBTest.sysout("issue5349.START");

    FBTest.openNewTab(basePath + "chrome/5349/issue5349.html", function(win)
    {
        FBTest.executeContextMenuCommand(win.document.getElementById("selectbox"), "menu_firebugInspect", function()
        {
            FBTest.testDone("issue5349.DONE");
        });
    });
}
