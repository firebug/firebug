<?php
    setcookie("EditCookie1", "Test Cookie Value", 1565778363, "/firecookie/tests/general", "", false, true);
    setcookie("EditCookie2", "Test Cookie Value", null, "/firecookie/tests/general", "", false, true);
    setcookie("EditCookie3", "Test Cookie Value", null, "/firecookie/tests/general", "", false, false);
    setcookie("EditCookie4", "Test Cookie Value", null, "/firecookie/tests/general", "", true, true);
    setcookie("EditCookie5", "Test Cookie Value", null, "/firecookie/tests/general", "", true, false);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Edit Cookies</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<h1>Edit Cookies</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug, enable Cookies panel and refresh this page.</li>
<li>There should be a <i>EditCookie3</i> cookie in the list (among others).</li>
<li>Right click on it and pick <i>Edit</i>.</li>
<li>Change the <i>Value</i> to <code>newvalue</code></li>
<li>Press OK and verify the <i>Cookies</i> panel, the value must be changed.</li>
</ol>

</body>
</html>
