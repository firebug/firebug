function runTest()
{
    FBTest.progress("using baseLocalPath: " + baseLocalPath);

    // Compute relative path and construct module loader.
    var baseUrl = baseLocalPath + "loader/paths/";
    var config = {
        context: baseUrl + Math.random(),  // to give each test its own loader,
        baseUrl: baseUrl,
        xhtml: true,
    };

    var require = FBTest.getRequire();
    require(config, ["add", "subtract"], function(AddModule, SubtractModule)
    {
        FBTest.compare(3, AddModule.add(1, 2), "The add module must be properly loaded");
        FBTest.compare(2, SubtractModule.subtract(3, 1), "The subtract module must be properly loaded");
        FBTest.testDone();
    });
}
