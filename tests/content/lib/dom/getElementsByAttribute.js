function runTest()
{
    verifyResult(2, document, "id");
    verifyResult(1, document, "id", "testTitle");
    verifyResult(0, document, "test");
    verifyResult(2, document.body, "id");
    verifyResult(1, document.body, "id", "testTitle");
    verifyResult(0, document.body, "test");
    var docFrag = document.createDocumentFragment();
    var div = document.createElement("div");
    div.setAttribute("id", "test");
    docFrag.appendChild(div);
    verifyResult(1, docFrag, "id");
    verifyResult(1, docFrag, "id", "test");
    verifyResult(0, docFrag, "id", "hello");
    verifyResult(0, null, "id");
    verifyResult(0, "notANode", "id");
    verifyResult(0, {test: "hi"}, "id");

    FBTest.testDone();
}

function verifyResult(expected, node, attrName, attrValue)
{
    var result = FW.FBL.getElementsByAttribute(node, attrName, attrValue);
    FBTrace.sysout("result " + (typeof result), result);
    if (FBTest.ok(result instanceof NodeList || Array.isArray(result),
        "Returned value must be an array or a NodeList"))
    {
        FBTest.compare(expected, result.length,
            "'node' must contain " + expected + " element" + (expected !== 1 ? "s" : "") +
            " with '" + attrName + "' as attribute name" +
            (attrValue ? " and '" + attrValue + "' as its value" : ""));
    }
}