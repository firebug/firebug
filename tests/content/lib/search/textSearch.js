function runTest()
{
    FBTest.openNewTab(basePath + "lib/search/textSearch.htm", function(win)
    {
        var root = win.document.getElementById("content");
        if (!FBTest.ok(root, "The 'content' element must exist."))
        {
            FBTest.testDone();
            return;
        }

        var child = win.document.getElementById("child");

        function compareFind(node, offset, result)
        {
            result = FW.FBL.unwrapObject(result);
            node = FW.FBL.unwrapObject(node);

            FBTest.ok(node === result, "Node matches");
            if (node)
            {
                FBTest.compare(offset, search.range && search.range.startOffset,
                    "Range Start " + offset);
            }
        }

        var search = new FW.FBL.TextSearch(root);

        compareFind(root.firstChild, 0, search.find("a", false, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 3, search.findNext(true, true, false, false));

        compareFind(child.firstChild, 0, search.findNext(true, true, false, false));
        compareFind(child.firstChild, 5, search.findNext(true, true, false, false));

        compareFind(root.lastChild, 4, search.findNext(true, true, false, false));
        compareFind(root.lastChild, 5, search.findNext(true, true, false, false));

        FBTest.compare(undefined, search.findNext(false, true, false, false), "Node matches");
        search.reset();

        compareFind(root.lastChild, 5, search.find("a", true, false));
        compareFind(root.lastChild, 4, search.findNext(true, true, true, false));

        compareFind(child.firstChild, 5, search.findNext(true, true, true, false));
        compareFind(child.firstChild, 0, search.findNext(true, true, true, false));

        compareFind(root.firstChild, 3, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 0, search.findNext(true, true, true, false));
        FBTest.compare(undefined, search.findNext(false, true, true, false), "Node matches");
        search.reset();

        compareFind(root.firstChild, 0, search.find("aa", false, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, false, false));

        compareFind(root.lastChild, 4, search.findNext(true, true, false, false));

        FBTest.compare(undefined, search.findNext(false, true, false, false), "Node matches");
        search.reset();

        compareFind(root.firstChild, 0, search.find("a", false, false));
        compareFind(child.firstChild, 0, search.findNext(true, false, false, false));
        compareFind(root.lastChild, 4, search.findNext(true, false, false, false));
        FBTest.compare(undefined, search.findNext(false, false, false, false), "Node matches");
        search.reset();

        compareFind(root.lastChild, 5, search.find("a", true, false));
        compareFind(child.firstChild, 5, search.findNext(true, false, true, false));
        compareFind(root.firstChild, 3, search.findNext(true, false, true, false));
        FBTest.compare(undefined, search.findNext(false, false, true, false), "Node matches");
        search.reset();

        compareFind(root.firstChild, 0, search.find("aa", false, false));
        compareFind(root.lastChild, 4, search.findNext(true, false, false, false));
        FBTest.compare(undefined, search.findNext(false, false, false, false), "Node matches");
        search.reset();

        compareFind(root.lastChild, 4, search.find("aa", true, false));
        compareFind(root.firstChild, 2, search.findNext(true, false, true, false));
        FBTest.compare(undefined, search.findNext(false, false, true, false), "Node matches");
        search.reset();

        search = new FW.FBL.TextSearch(child.firstChild);
        compareFind(child.firstChild, 0, search.find("a", false, false));
        compareFind(child.firstChild, 5, search.findNext(true, true, false, false));
        compareFind(child.firstChild, 0, search.findNext(true, true, false, false));
        search.reset();

        search = new FW.FBL.TextSearch(root.firstChild);
        compareFind(root.firstChild, 0, search.find("a", false, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, false, false));
        compareFind(root.firstChild, 3, search.findNext(true, true, false, false));
        FBTest.compare(undefined, search.findNext(false, true, false, false), "Node matches");
        search.reset();

        compareFind(root.firstChild, 3, search.find("a", true, false));
        compareFind(root.firstChild, 2, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 1, search.findNext(true, true, true, false));
        compareFind(root.firstChild, 0, search.findNext(true, true, true, false));
        FBTest.compare(undefined, search.findNext(false, true, true, false), "Node matches");
        search.reset();

        FBTest.testDone();
    });
}
