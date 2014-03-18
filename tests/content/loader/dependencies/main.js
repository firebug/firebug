function runTest()
{
    FBTest.progress("using module dependencies: " + baseLocalPath);

    // Compute relative path and construct module loader.
    var baseUrl = baseLocalPath + "loader/dependencies/";
    var config = {
        context: baseUrl + Math.random(),  // to give each test its own loader,
        baseUrl: baseUrl,
        xhtml: true,
    };

    var require = FBTest.getRequire();
    require(config, ["module-a"], function(A)
    {
        var message = A.getMessage();
        FBTest.compare("Hello World!", message, "The message from modules must match.");
        FBTest.testDone();
    });
}
