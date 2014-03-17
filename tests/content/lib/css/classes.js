function runTest()
{
    var element = document.createElement("div");

    // Test I.
    element.setAttribute("class", "");
    FW.FBL.setClass(element, "a b c");
    FBTest.ok(FW.FBL.hasClass(element, "a"), "The element must have class 'a'");
    FBTest.ok(FW.FBL.hasClass(element, "b"), "The element must have class 'b'");
    FBTest.ok(FW.FBL.hasClass(element, "c"), "The element must have class 'c'");
    FBTest.ok(FW.FBL.hasClass(element, "a c"), "The element must have class 'a c'");
    FBTest.ok(FW.FBL.hasClass(element, "a b c"), "The element must have class 'a b c'");

    // Test II.
    element.setAttribute("class", "");
    FW.FBL.setClass(element, "myClass");
    FBTest.ok(!FW.FBL.hasClass(element, "my"), "The element must not have class 'a'");
    FBTest.ok(!FW.FBL.hasClass(element, "my class"), "The element must not have class 'my class'");
    FBTest.ok(!FW.FBL.hasClass(element, "myclass"), "The element must not have class 'myclass'");

    // Test III.
    element.setAttribute("class", "");
    for (var i=0; i<5; i++)
        FW.FBL.setClass(element, "test" + i);

    FW.FBL.removeClass(element, "test1");
    FW.FBL.removeClass(element, "test3");
    FBTest.ok(!FW.FBL.hasClass(element, "test1 test3"), "The element must not have class 'test1 test3'");
    FBTest.ok(FW.FBL.hasClass(element, "test0 test2 test4"), "The element must have class 'test0 test2 test4'");

    FBTest.testDone();
}
