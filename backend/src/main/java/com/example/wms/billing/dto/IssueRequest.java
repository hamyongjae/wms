package com.example.wms.billing.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class IssueRequest {

    // 납기일 (미지정 가능)
    private LocalDate dueDate;
}
