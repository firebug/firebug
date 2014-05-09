function runTest()
{
    // Valid values
    verifyResult("rgb(0, 128, 0)", "green");
    verifyResult("rgb(139, 0, 0)", "darkred");
    verifyResult("rgb(100, 149, 237)", "CornflowerBlue");
    verifyResult("rgba(0, 0, 0, 0)", "transparent");

    // Invalid values
    verifyResult("nonexistentcolor", "nonexistentcolor");

    FBTest.testDone();
}

function verifyResult(expected, color)
{
    var result = FW.FBL.colorNameToRGB(color);
    FBTest.compare(expected, result, "Color name must be correctly converted to RGB");
}