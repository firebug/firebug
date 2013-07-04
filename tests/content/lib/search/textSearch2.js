function runTest()
{
    FBTest.openNewTab(basePath + "lib/search/textSearch2.html", function(win)
    {
        var root = win.document.getElementById("content");
        FBTest.ok(root, "The 'content' element must exist.");
        FBTest.testDone();
    });
}
