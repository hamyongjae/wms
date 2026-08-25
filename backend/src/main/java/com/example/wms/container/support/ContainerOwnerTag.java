package com.example.wms.container.support;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 컨테이너 memo 앞머리의 [ ... ] 태그에서 화주(고객)명을 추출하는 공용 유틸.
 * 과거 데이터의 규격(20ft/40ft)·소유구분(자가/임차) 토큰은 걸러낸다.
 * 프론트 lib/owner.ts의 extractOwner와 동일 규칙 — 계약↔컨테이너 직접 링크가 없는
 * 데이터를 화주명으로 보정 매칭할 때(컨테이너 관리 화주 검색, 계약관리·매출관리 위치 표시
 * 폴백) 여러 곳에서 같은 규칙을 써야 해서 하나로 모았다.
 * 예: "[20ft · 자가 · 대원] 특이사항" → "대원", "[대원]" → "대원", "[20ft · 자가]" → null
 */
public final class ContainerOwnerTag {

    private static final Pattern OWNER_TAG = Pattern.compile("^\\[([^\\]]+)\\]");

    private ContainerOwnerTag() {
    }

    public static String extractOwner(String memo) {
        if (memo == null) return null;
        Matcher m = OWNER_TAG.matcher(memo);
        if (!m.find()) return null;
        List<String> keep = new ArrayList<>();
        for (String token : m.group(1).split("·")) {
            String t = token.trim();
            if (t.isEmpty() || t.matches("(?i)\\d+ft") || t.equals("자가") || t.equals("임차")) {
                continue;
            }
            keep.add(t);
        }
        return keep.isEmpty() ? null : String.join(" · ", keep);
    }
}
