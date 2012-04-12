function runTest()
{
    FBTest.sysout("exampleLib1.START");

    var element = document.createElement("div");
    element.appendChild(document.createTextNode("some text"));

    var html = FW.FBL.getElementHTML(element);
    FBTest.compare("<div>some text</div>", html, "Verify FW.FBL.getElementHTML()");

    FBTest.testDone("exampleScript1.DONE");
}
