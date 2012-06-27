<?php
    setcookie("TestCookie60[user]", "CookieValue60", time() + 86400, "/firecookie/tests/issue60");
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Issue 60: "[" and "]" characters get badly encoded on cookie name upon editing</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<div class="topBar">
    <a href="http://code.google.com/p/firecookie/issues/detail?id=60">Issue 60</a>
</div>
<h1>Issue 60: "[" and "]" characters get badly encoded on cookie name upon editing</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and enable the <b>Cookies</b> panel.</li>
<li>Right click on <span style="color:green">TestCookie60[user]</span> and pick Edit.</li>
<li>Don't touch anything and press OK in the dialog.</li>
<li>The name changes to <span style="color:green">CakeCookie%5BUser%5D</span> -> BUG</li>
</ol>

<i>When the name changes a new cookie is created.</i>

</body>
</html>
