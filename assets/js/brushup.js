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
        var seen = function (el) { return movedElements.indexOf(el) !== -1; };

        var children = Array.prototype.slice.call(article.children);

        // 1) DOCTOR heading div (direct child with <p>/<P> text === "DOCTOR")
        children.forEach(function (child) {
            if (child.tagName && child.tagName.toLowerCase() === "div" && !seen(child)) {
                var p = child.querySelector("p, P");
                if (p && p.textContent && p.textContent.trim() === "DOCTOR") {
                    movedElements.push(child);
                }
            }
        });

        // 2) <center> wrappers containing #post_list2 (the doctor portrait blocks)
        children.forEach(function (child) {
            if (child.tagName && child.tagName.toLowerCase() === "center" && !seen(child)) {
                if (child.querySelector("#post_list2")) {
                    movedElements.push(child);
                }
            }
        });

        // Also catch nested centers with post_list2 that might not be direct children
        var nestedCenters = article.querySelectorAll("center");
        Array.prototype.forEach.call(nestedCenters, function (center) {
            if (!seen(center) && center.querySelector("#post_list2")) {
                movedElements.push(center);
            }
        });

        // 3) Doctor detail div (contains text "診療科" or "専門医" or "出身大学")
        //    This usually follows the portrait block — pull it in next to the doctor.
        var detailKeywords = ["診療科", "専門医", "出身大学"];
        children.forEach(function (child) {
            if (!child.tagName || child.tagName.toLowerCase() !== "div" || seen(child)) return;
            var text = (child.textContent || "").replace(/\s+/g, "");
            var hit = detailKeywords.some(function (kw) { return text.indexOf(kw) !== -1; });
            // Skip short headings or "DOCTOR" heading we already captured
            if (hit && text.length > 10) {
                movedElements.push(child);
            }
        });

        if (movedElements.length === 0) return;

        // Insertion point: right after #post_image
        var anchor = postImage.nextSibling;
        movedElements.forEach(function (el) {
            article.insertBefore(el, anchor);
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
