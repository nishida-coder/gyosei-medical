(function () {
    "use strict";

    function ready(fn) {
        if (document.readyState !== "loading") {
            fn();
        } else {
            document.addEventListener("DOMContentLoaded", fn);
        }
    }

    // Reorder single clinic page so the DOCTOR block appears right after the logo image.
    // IMPORTANT: #post_list2 is reused by the MEDIA section on the same page, so we must
    // distinguish the doctor block (has .cat-category tags) from media items (no tags).
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

        // 2) <center> wrappers containing #post_list2 WITH .cat-category tags
        //    (these are the doctor portrait blocks; MEDIA items have no cat tags)
        function isDoctorCenter(center) {
            if (!center.querySelector("#post_list2")) return false;
            return !!center.querySelector(".cat-category, .cat-category2, .cat-category3");
        }

        var allCenters = article.querySelectorAll("center");
        Array.prototype.forEach.call(allCenters, function (center) {
            if (!seen(center) && isDoctorCenter(center)) {
                movedElements.push(center);
            }
        });

        // 3) Doctor detail div (contains "診療科" / "専門医" / "出身大学" / "大学")
        var detailKeywords = ["診療科", "専門医", "出身大学", "大学："];
        children.forEach(function (child) {
            if (!child.tagName || child.tagName.toLowerCase() !== "div" || seen(child)) return;
            var text = (child.textContent || "").replace(/\s+/g, "");
            if (text.length < 8 || text.length > 400) return;
            var hit = detailKeywords.some(function (kw) { return text.indexOf(kw) !== -1; });
            if (hit) movedElements.push(child);
        });

        if (movedElements.length === 0) return;

        // Insertion point: right after #post_image
        var anchor = postImage.nextSibling;
        movedElements.forEach(function (el) {
            article.insertBefore(el, anchor);
            anchor = el.nextSibling;
        });
    }

    // Per-clinic YouTube URL overrides. The site stores clinic content in TCD pagebuilder
    // meta fields, so patching specific SNS icon links is easier from the client side.
    var CLINIC_YOUTUBE = {
        "kokoromental": "https://www.youtube.com/watch?v=xCg6wNiL8BQ"
    };

    function patchClinicYouTube() {
        var slugMatch = window.location.pathname.match(/^\/([^/]+)\/?$/);
        if (!slugMatch) return;
        var slug = slugMatch[1];
        var url = CLINIC_YOUTUBE[slug];
        if (!url) return;

        // Find anchors whose image src ends with /3.png — these are the YouTube icons
        var anchors = document.querySelectorAll('a img[src*="/2024/06/3.png"]');
        Array.prototype.forEach.call(anchors, function (img) {
            var a = img.closest("a");
            if (!a) return;
            var current = (a.getAttribute("href") || "").trim();
            if (current === "" || current === "#") {
                a.setAttribute("href", url);
                a.setAttribute("target", "_blank");
                a.setAttribute("rel", "noopener");
            }
        });
    }

    // Tag the MEDIA heading div so CSS can extend beige background up through it
    function unifyMediaSection() {
        var article = document.getElementById("article");
        if (!article) return;
        var divs = article.querySelectorAll("div");
        Array.prototype.forEach.call(divs, function (div) {
            var p = div.querySelector("p, P");
            if (!p) return;
            if (p.textContent && p.textContent.trim() === "MEDIA") {
                div.classList.add("gm-media-heading");
            }
        });
    }

    // Home page: restructure the 4 link banners (EATS / DENTAL / Reputation / OB医師へ)
    // - Remove the OB医師の方へ banner
    // - Convert layout to 2 columns
    // - Append a CTA button for 掲載申込
    function restructureHomeBanners() {
        if (!document.body.classList.contains("home")) return;

        // Each banner is an unnamed <div class=""> containing <center><a><img></a></center>
        // with a distinctive image filename we can match on.
        var bannerImgs = document.querySelectorAll(
            'img[src*="GYOSEI-EATS"],' +
            'img[src*="GYOSEI-DENTAL"],' +
            'img[src*="/2024/05/2-2.png"],' +
            'img[src*="OB医師の方へバナー"],' +
            'img[src*="OB%E5%8C%BB%E5%B8%AB"]'
        );
        if (!bannerImgs.length) return;

        // Resolve each img to its outer banner wrapper (the direct div child)
        var banners = [];
        var parent = null;
        Array.prototype.forEach.call(bannerImgs, function (img) {
            var wrapper = img;
            while (wrapper && wrapper.parentNode) {
                var p = wrapper.parentNode;
                if (p && p.children && p.children.length && wrapper.tagName === "DIV" && p !== wrapper) {
                    // stop at a DIV whose parent is a common banner container
                    break;
                }
                wrapper = p;
            }
            // Simpler: walk up to the nearest DIV that is a direct child of its parent
            // and where the parent has multiple such DIV children.
            var node = img;
            while (node && node.tagName !== "DIV") node = node.parentNode;
            // Climb until the wrapper is an immediate child of a shared parent with siblings
            while (node && node.parentNode && node.parentNode.children.length === 1) {
                node = node.parentNode;
            }
            if (node && banners.indexOf(node) === -1) banners.push(node);
            if (node && !parent) parent = node.parentNode;
        });

        if (banners.length < 2 || !parent) return;

        // Remove OB医師 banner
        banners.forEach(function (b) {
            var img = b.querySelector('img[src*="OB医師"], img[src*="OB%E5%8C%BB%E5%B8%AB"]');
            if (img) {
                b.parentNode.removeChild(b);
            }
        });

        // Tag parent and surviving banners for CSS styling
        parent.classList.add("gm-home-banners");
        var survivors = Array.prototype.filter.call(
            parent.querySelectorAll(":scope > div"),
            function (d) { return d.querySelector("img"); }
        );
        survivors.forEach(function (d) { d.classList.add("gm-home-banner-item"); });

        // Append CTA if not already present
        if (!parent.querySelector(".gm-home-cta")) {
            var cta = document.createElement("div");
            cta.className = "gm-home-cta";
            cta.innerHTML =
                '<a href="/join/" class="gm-home-cta-btn">' +
                '<span class="gm-home-cta-label">暁星OB医師で掲載をご希望の方はこちら</span>' +
                '<span class="gm-home-cta-arrow">&rsaquo;</span>' +
                "</a>";
            parent.parentNode.insertBefore(cta, parent.nextSibling);
        }
    }

    // Archive / category pages: enrich each clinic card with doctor photo + name + grad year
    // by fetching the linked clinic page in parallel and extracting the data.
    function enrichArchiveCards() {
        var isArchive = /^\/(category|category2|category3|clinic)\//.test(window.location.pathname);
        if (!isArchive) return;
        var items = document.querySelectorAll("#post_list li.article");
        if (!items.length) return;

        Array.prototype.forEach.call(items, function (li) {
            var anchor = li.querySelector("a[href]");
            if (!anchor) return;
            var url = anchor.getAttribute("href");
            if (!url || url.indexOf("http") !== 0) return;

            // sessionStorage cache to avoid repeated fetches
            var cacheKey = "gm_doctor_" + url;
            var cached = null;
            try { cached = sessionStorage.getItem(cacheKey); } catch (e) {}

            function apply(data) {
                if (!data) return;
                var imageDiv = li.querySelector(".image");
                if (imageDiv && data.photo) {
                    var img = imageDiv.querySelector("img");
                    if (img) {
                        img.setAttribute("src", data.photo);
                        img.removeAttribute("srcset");
                        img.removeAttribute("width");
                        img.removeAttribute("height");
                        img.style.borderRadius = "50%";
                        img.style.padding = "0";
                        img.style.objectFit = "cover";
                    }
                    imageDiv.classList.add("gm-archive-doctor");
                }
                var title = li.querySelector(".title");
                if (title) {
                    var clinicName = (title.textContent || "").trim();
                    var parts = [];
                    if (data.doctor) parts.push(data.doctor + (data.grad ? "（" + data.grad + "）" : ""));
                    if (data.specialty) parts.push(data.specialty);
                    if (clinicName) parts.push(clinicName);
                    title.innerHTML =
                        (data.doctor ? '<span class="gm-archive-doctor-name">' + escapeHtml(data.doctor) +
                            (data.grad ? '<span class="gm-archive-grad">（' + escapeHtml(data.grad) + '）</span>' : "") +
                            "</span>" : "") +
                        (data.specialty ? '<span class="gm-archive-specialty">' + escapeHtml(data.specialty) + "</span>" : "") +
                        (clinicName ? '<span class="gm-archive-clinic">' + escapeHtml(clinicName) + "</span>" : "");
                    title.classList.add("gm-archive-enriched");
                }
            }

            if (cached) {
                try { apply(JSON.parse(cached)); } catch (e) {}
                return;
            }

            fetch(url, { credentials: "same-origin" })
                .then(function (r) { return r.ok ? r.text() : ""; })
                .then(function (html) {
                    if (!html) return;
                    var doc = new DOMParser().parseFromString(html, "text/html");
                    var data = extractDoctorData(doc);
                    if (data) {
                        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
                        apply(data);
                    }
                })
                .catch(function () {});
        });
    }

    function extractDoctorData(doc) {
        var out = { photo: null, doctor: null, grad: null, specialty: null };

        // Doctor photo: first image inside #post_list2 .image
        var photoImg = doc.querySelector("#post_list2 .image img");
        if (photoImg) out.photo = photoImg.getAttribute("src");

        // Doctor name + grad year from first p.title strong text
        var nameEl = doc.querySelector("#post_list2 .wp-block-column p.title, #post_list2 .wp-block-column p strong");
        if (nameEl) {
            var raw = (nameEl.innerHTML || nameEl.textContent || "")
                .replace(/<br\s*\/?>/gi, "|")
                .replace(/<[^>]+>/g, "");
            var parts = raw.split("|").map(function (s) { return s.trim(); }).filter(Boolean);
            if (parts.length >= 1) out.doctor = parts[0];
            if (parts.length >= 2) {
                var m = parts[1].match(/(\d{2,4}年?卒)/);
                if (m) out.grad = m[1];
                else out.grad = parts[1];
            }
        }

        // Specialty from first cat-category tag text
        var catEl = doc.querySelector("#post_meta_top .cat-category, .meta .cat-category");
        if (catEl) out.specialty = (catEl.textContent || "").trim();

        return out;
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // Parent theme JS sets .inview-fadein{opacity:0} and then animates in — that delays
    // the hero caption. Force caption visible immediately and keep it visible.
    function forceHeroVisible() {
        var selectors = [
            "#header_slider",
            "#header_slider .item",
            "#header_slider .slick-slide",
            "#header_slider .caption",
            "#header_slider .caption .headline",
            "#header_slider .caption .catchphrase"
        ];
        selectors.forEach(function (sel) {
            var els = document.querySelectorAll(sel);
            Array.prototype.forEach.call(els, function (el) {
                el.style.opacity = "1";
                el.style.visibility = "visible";
            });
        });
    }

    ready(function () {
        forceHeroVisible();
        setTimeout(forceHeroVisible, 0);
        setTimeout(forceHeroVisible, 100);
        setTimeout(forceHeroVisible, 500);

        reorderSingleClinic();
        unifyMediaSection();
        patchClinicYouTube();
        restructureHomeBanners();
        enrichArchiveCards();

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
