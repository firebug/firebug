function runTest()
{
    FBTest.sysout("issue958.START");

    FBTest.openNewTab(basePath + "search/958/issue958.html", function(win)
    {
        FBTest.openFirebug();
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
        FBTest.testDone("issue958.DONE");
    });
}
