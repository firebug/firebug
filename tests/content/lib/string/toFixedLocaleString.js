function runTest()
{
    // Valid values
    verifyResult(1);
    verifyResult(1, 0);
    verifyResult(1, 1);
    verifyResult(-1, 1);
    verifyResult(1234.5, 0);
    verifyResult(1234.5, 1);
    verifyResult(1234.5, 2);
    verifyResult(-1234.4, 0);
    verifyResult(-1234.5, 0);

    // Invalid values
    verifyResult("test", 1);
    verifyResult(1, "test");
    verifyResult(1, -1);

    FBTest.testDone();
}

function verifyResult(number, decimals)
{
    // Check whether 'number' is a valid number
    if (isNaN(parseFloat(number)) ||
        (typeof decimals !== "undefined" && isNaN(parseFloat(decimals))) || decimals < 0)
    {
        try
        {
            FW.FBL.toFixedLocaleString(number, decimals);
            FBTest.ok(false, "Invalid argument(s) number='" + number + "' and decimals='" +
                decimals + "' don't throw an exception");
        }
        catch (e)
        {
            FBTest.compare(expected, result, "Invalid argument(s) throw an exception: " +
                e.message);
        }
    }
    else
    {
        var expected = new Intl.NumberFormat(undefined,
            {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(number);

        var result = FW.FBL.toFixedLocaleString(number, decimals);

        var msg = "Formatted string for " + number;
        if (decimals)
            msg += " with " + decimals + " decimals";
        msg += " must match expected format";

        FBTest.compare(expected, result, msg);
    }
}