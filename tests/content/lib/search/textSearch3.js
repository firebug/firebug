function runTest()
{
    FBTest.openNewTab(basePath + "lib/search/textSearch3.html", function(win)
    {
        var root = win.document.getElementById("content");
        FBTest.ok(root, "The 'content' element must exist.");
        FBTest.testDone();
    });
}
