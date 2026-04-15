(function () {
    "use strict";

    function ready(fn) {
        if (document.readyState !== "loading") {
            fn();
        } else {
            document.addEventListener("DOMContentLoaded", fn);
        }
    }

    // Reorder single clinic page so DOCTOR block appears right after the logo image
    function reorderSingleClinic() {
        var article = document.getElementById("article");
        if (!article) return;
        var postImage = document.getElementById("post_image");
        if (!postImage) return;

        var movedElements = [];

        // 1) Find DOCTOR heading div (div containing a <p>/<P> whose text is "DOCTOR")
        var children = Array.prototype.slice.call(article.children);
        children.forEach(function (child) {
            if (child.tagName && child.tagName.toLowerCase() === "div") {
                var p = child.querySelector("p, P");
                if (p && p.textContent && p.textContent.trim() === "DOCTOR") {
                    movedElements.push(child);
                }
            }
        });

        // 2) Find all <center> elements (direct children of article) containing #post_list2
        children.forEach(function (child) {
            if (child.tagName && child.tagName.toLowerCase() === "center") {
                if (child.querySelector("#post_list2")) {
                    movedElements.push(child);
                }
            }
        });

        // Also check nested centers just in case (TCD often wraps oddly)
        var nestedCenters = article.querySelectorAll("center");
        Array.prototype.forEach.call(nestedCenters, function (center) {
            if (movedElements.indexOf(center) === -1 && center.querySelector("#post_list2")) {
                movedElements.push(center);
            }
        });

        if (movedElements.length === 0) return;

        // Insertion point: right after #post_image
        var anchor = postImage.nextSibling;
        movedElements.forEach(function (el) {
            article.insertBefore(el, anchor);
            // Advance anchor so each next element is inserted after the previous moved one
            anchor = el.nextSibling;
        });
    }

    ready(function () {
        reorderSingleClinic();

        var targets = document.querySelectorAll(
            "#post_list .article, #main_contents h2, #main_contents h3, .widget, #post_list2 .article"
        );
        targets.forEach(function (el) {
            el.classList.add("gm-reveal");
        });

        if (!("IntersectionObserver" in window)) {
            targets.forEach(function (el) { el.classList.add("is-in"); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-in");
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

        targets.forEach(function (el) { io.observe(el); });
    });
})();
