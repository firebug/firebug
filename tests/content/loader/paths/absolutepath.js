function runTest()
{
    FBTest.progress("using baseLocalPath: " + baseLocalPath);

    var baseUrl = baseLocalPath + "loader/paths/";
    var config = {
        context: baseUrl + Math.random(),  // to give each test its own loader,
        xhtml: true,
    };

    var require = FBTest.getRequire();
    require(config, [
        baseUrl + "add.js",
        baseUrl + "subtract.js"
    ],
    function(AddModule, SubtractModule)
    {
        FBTest.compare(3, AddModule.add(1, 2), "The add module must be properly loaded");
        FBTest.compare(2, SubtractModule.subtract(3, 1), "The subtract module must be properly loaded");
        FBTest.testDone();
    });
}
