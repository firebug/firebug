function runTest()
{
    FBTest.openNewTab(basePath + "search/4603/issue4603.html", function()
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");

            var win = FW.Firebug.chrome.window;
            var doc = win.document;
            var searchField = doc.getElementById("fbSearchBox");
            var searchFieldIcon = doc.getAnonymousElementByAttribute(searchField, "class",
                "fbsearch-icon");

            var normalSearchFieldIcon = win.getComputedStyle(searchFieldIcon, null).
                backgroundImage;

            searchField.value = "search";

            FBTest.ok(normalSearchFieldIcon !=
                win.getComputedStyle(searchFieldIcon, null).backgroundImage,
                "Search Field icon must be changed");

            FBTest.click(searchFieldIcon);

            FBTest.compare("", searchField.value, "Search Field must be cleared");
            FBTest.compare(normalSearchFieldIcon,
                win.getComputedStyle(searchFieldIcon, null).backgroundImage,
                "Search Field icon must be normal again");

            FBTest.testDone();
        });
    });
}
