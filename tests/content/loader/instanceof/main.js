function runTest()
{
    FBTest.progress("using module dependencies: " + baseLocalPath);

    // Compute relative path and construct module loader.
    var baseUrl = baseLocalPath + "loader/instanceof/";
    var config = {
        context: baseUrl + Math.random(),  // to give each test its own loader,
        baseUrl: baseUrl,
        xhtml: true,
    };

    var require = FBTest.getRequire();
    require(config, ["reps"], function(Reps)
    {
        Reps.innerTest(FW, FBTest, window);

        var obj = new MyObject("hello");

        // obj is instance of MyObject
        FBTest.ok((obj instanceof MyObject),
            "The object is instance of MyObject");

        FBTest.ok((Reps.instanceOf(obj, MyObject)),
            "The object is Reps.instanceOf MyObject");

        FBTest.ok((Reps.XW_instanceOf(FW.FBL, obj, MyObject)),
            "The object is Reps.XW_instanceOf MyObject");

        // obj is not instance of Window
        FBTest.ok(!(obj instanceof window.Window),
            "The object is not an instanceof window.Window");

        FBTest.ok(!(Reps.instanceOf(obj, window.Window)),
            "The object "+obj+" is not Reps.instanceOf window.Window "+window.Window);
        if (Reps.instanceOf(obj, window.Window))
            FBTest.progress("Failed "+Reps.instanceOf.toSource());

        FBTest.ok(!(Reps.XW_instanceOf(FW.FBL, obj, window.Window)),
            "The object is not an Reps.XW_instanceOf Window");

        // window is instance of Window
        FBTest.ok((window instanceof window.Window),
            "The window is an instanceof window.Window");

        FBTest.ok((Reps.instanceOf(window, window.Window)),
            "The window is Reps.instanceOf window.Window");

        FBTest.ok((Reps.XW_instanceOf(FW.FBL, window, window.Window)),
            "The window is an Reps.XW_instanceOf window.Window");

        FBTest.testDone();
    });
}

function MyObject(msg)
{
    this.msg = msg;
}
