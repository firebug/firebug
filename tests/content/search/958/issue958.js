function runTest()
{
    FBTest.openNewTab(basePath + "search/958/issue958.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("console");

            var searchField = FW.Firebug.chrome.$("fbSearchBox");
            var searchString = "hello";

            // FIX ME: characters should be sent into the search field individually
            // (using key events) to simulate incremental search.
            searchField.value = searchString;

            FBTest.sendKey("RETURN", searchField);

            FBTest.selectPanel("html");
            FBTest.selectPanel("stylesheet");

            FBTest.ok(searchField.value == searchString, "The search field must still contain '"+
                searchString+"' after switching between panels");
            FBTest.testDone();
        });
    });
}
